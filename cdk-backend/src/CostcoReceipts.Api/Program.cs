using Amazon.DynamoDBv2;
using CostcoReceipts.Api.Services;
using CostcoReceipts.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

// Add AWS services
builder.Services.AddAWSService<IAmazonDynamoDB>();

// Add HttpClient for external API calls
builder.Services.AddHttpClient();

// Add Auth0 JWT authentication
builder.Services.AddAuth0Jwt();

// Add application services
builder.Services.AddScoped<ISingleTableService, SingleTableService>();

// Add Lambda hosting
builder.Services.AddAWSLambdaHosting(LambdaEventSource.RestApi);

var app = builder.Build();

// Configure the HTTP request pipeline
app.UseRouting();
app.UseCors();

// Add Auth0 logging middleware for debugging
app.UseMiddleware<Auth0LoggingMiddleware>();

// Add authentication and authorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();