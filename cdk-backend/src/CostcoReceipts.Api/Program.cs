using Amazon.DynamoDBv2;
using Amazon.Runtime;
using CostcoReceipts.Api.Services;
using CostcoReceipts.Api.Middleware;
using CostcoReceipts.Api.Configuration;
using Amazon.Extensions.NETCore.Setup;

var builder = WebApplication.CreateBuilder(args);

// Check if running in Lambda
var isLambda = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AWS_LAMBDA_FUNCTION_NAME"));

// Add services to the container
// JSON serialization uses default camelCase for API responses
// DynamoDB uses snake_case via [DynamoDBProperty] attributes (separate concern)
builder.Services.AddControllers();

// Configure CORS - single configuration for all environments
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
        
        if (allowedOrigins != null && allowedOrigins.Length > 0)
        {
            policy
                .WithOrigins(allowedOrigins)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        }
        else
        {
            // No origins configured - reject all
            policy
                .AllowAnyMethod()
                .AllowAnyHeader()
                .SetIsOriginAllowed(_ => false);
        }
    });
});

// Configure AWS services
if (builder.Environment.IsDevelopment() && !isLambda)
{
    // Local development - use AWS profile from configuration
    var awsProfile = builder.Configuration["AWS:Profile"];
    if (!string.IsNullOrEmpty(awsProfile))
    {
        var awsOptions = new AWSOptions
        {
            Profile = awsProfile,
            Region = Amazon.RegionEndpoint.GetBySystemName(
                builder.Configuration["AWS:Region"] ?? "us-east-1")
        };
        builder.Services.AddDefaultAWSOptions(awsOptions);
    }
    
    builder.Services.AddAWSService<IAmazonDynamoDB>();
}
else
{
    // Lambda - use IAM role
    builder.Services.AddAWSService<IAmazonDynamoDB>();
}

// Add HttpClient for external API calls
builder.Services.AddHttpClient();

// Add Auth0 JWT authentication
builder.Services.AddAuth0Jwt();

// Add configuration services
builder.Services.AddSingleton<AppConfiguration>();
builder.Services.AddSingleton<DynamoDbConfiguration>();

// Add application services
builder.Services.AddScoped<ISingleTableService, SingleTableService>();

// Add Lambda hosting only when running in Lambda
if (isLambda)
{
    builder.Services.AddAWSLambdaHosting(LambdaEventSource.RestApi);
}

// Add Swagger for development
if (builder.Environment.IsDevelopment() && !isLambda)
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo 
        { 
            Title = "Costco Receipts API", 
            Version = "v1",
            Description = "API documentation for development. Test authenticated endpoints using the frontend application."
        });
    });
}

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment() && !isLambda)
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Costco Receipts API V1");
        c.RoutePrefix = "swagger";
    });
}

app.UseRouting();
app.UseCors();

// Add Auth0 logging middleware for debugging
if (app.Environment.IsDevelopment())
{
    app.UseMiddleware<Auth0LoggingMiddleware>();
}

// Add authentication and authorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();