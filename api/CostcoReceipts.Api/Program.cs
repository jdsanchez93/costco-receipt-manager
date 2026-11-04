using Amazon;
using Amazon.Extensions.NETCore.Setup;
using Amazon.S3;
using CostcoReceipts.Api.Authentication;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Configuration;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Middleware;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<S3Options>(builder.Configuration.GetSection(S3Options.SectionName));
builder.Services.Configure<AwsOptions>(builder.Configuration.GetSection(AwsOptions.SectionName));
builder.Services.Configure<FrontendOptions>(builder.Configuration.GetSection(FrontendOptions.SectionName));
builder.Services.Configure<InternalApiOptions>(builder.Configuration.GetSection(InternalApiOptions.SectionName));
builder.Services.AddProblemDetails();
builder.Services.AddMemoryCache();

string MySqlConnectionString() =>
    builder.Configuration.GetConnectionString("MySql")
        ?? throw new InvalidOperationException(
            "ConnectionStrings:MySql is required. Set it in appsettings, user secrets, or env vars.");

// EF runs the AddDbContext options lambda once per scope, so calling AutoDetect
// in it cost every request a connection and a SELECT VERSION(). Detect once,
// on first use rather than at startup, so the host still starts with the
// database down. PublicationOnly because the default mode caches an exception:
// one failed detection would then fail every later request, even after the
// database came back. The price is that racing first requests each detect.
var serverVersion = new Lazy<ServerVersion>(
    () => ServerVersion.AutoDetect(MySqlConnectionString()),
    LazyThreadSafetyMode.PublicationOnly);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(MySqlConnectionString(), serverVersion.Value));

// One-shot schema migration: api/deploy/costco-deploy.sh runs the image it is
// about to deploy with this flag, as costco_migrator rather than costco_app, so
// the schema and the code that expects it always come from the same build.
// Returns before AddAuth0Jwt and the rest, which would throw: the migrate
// container is given a connection string and nothing else.
if (args.Contains("--migrate"))
{
    using var migrator = builder.Build();
    using var scope = migrator.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
    return;
}

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

// AWS credentials: an explicit named profile for local dev (AWS:Profile),
// otherwise the SDK's default credential provider chain (env vars, etc. —
// relevant once this runs somewhere with no IAM role, e.g. the Pi).
var aws = builder.Configuration.GetSection(AwsOptions.SectionName).Get<AwsOptions>() ?? new AwsOptions();
var awsOptions = new AWSOptions { Region = RegionEndpoint.GetBySystemName(aws.Region) };
if (!string.IsNullOrEmpty(aws.Profile))
{
    awsOptions.Profile = aws.Profile;
}
builder.Services.AddDefaultAWSOptions(awsOptions);
builder.Services.AddAWSService<IAmazonS3>();

builder.Services.AddControllers();
builder.Services.AddAuth0Jwt(builder.Configuration);
builder.Services
    .AddAuthentication()
    .AddScheme<AuthenticationSchemeOptions, InternalApiKeyAuthenticationHandler>(
        InternalApiKeyAuthenticationHandler.SchemeName, _ => { });
builder.Services.AddReceiptAuthorization();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

        if (allowedOrigins.Length == 0)
        {
            policy.SetIsOriginAllowed(_ => false);
            return;
        }

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    // In non-dev, surface unhandled exceptions as RFC 7807 ProblemDetails.
    app.UseExceptionHandler();
    app.UseStatusCodePages();
}

app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseMiddleware<UserProvisioningMiddleware>();
app.UseAuthorization();
app.MapControllers();

// Polled by costco-deploy on the Pi before it keeps a new image. Loopback
// only: requests through the Cloudflare Tunnel carry the public hostname as
// their Host header, so this 404s there.
app.MapHealthChecks("/healthz").RequireHost("127.0.0.1", "localhost");

app.Run();
