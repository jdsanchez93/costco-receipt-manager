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

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("MySql")
        ?? throw new InvalidOperationException(
            "ConnectionStrings:MySql is required. Set it in appsettings, user secrets, or env vars.");

    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString));
});

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

app.Run();
