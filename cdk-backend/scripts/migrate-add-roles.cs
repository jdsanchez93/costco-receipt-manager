/*
 * DynamoDB Migration Script: Add Role Field to Receipt Members
 *
 * This script scans all RECEIPT_MEMBER entities and sets the role field:
 * - The member with the earliest AddedAt timestamp becomes "owner"
 * - All other members become "editor"
 *
 * Usage:
 * 1. Ensure AWS credentials are configured
 * 2. Set the TABLE_NAME environment variable or update the constant below
 * 3. Run: dotnet script migrate-add-roles.cs
 *
 * Or run as a one-time Lambda function.
 */

using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

// Configuration
const string TABLE_NAME = "dev-costco-receipt-parser-main";

var dynamoDb = new AmazonDynamoDBClient();

Console.WriteLine("Starting migration: Adding role field to receipt members...");
Console.WriteLine($"Table: {TABLE_NAME}");

// Scan all RECEIPT_MEMBER entities
var allMembers = new List<Dictionary<string, AttributeValue>>();
Dictionary<string, AttributeValue>? exclusiveStartKey = null;

do
{
    var scanRequest = new ScanRequest
    {
        TableName = TABLE_NAME,
        FilterExpression = "entity_type = :entityType",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue>
        {
            { ":entityType", new AttributeValue("RECEIPT_MEMBER") }
        }
    };

    if (exclusiveStartKey != null)
    {
        scanRequest.ExclusiveStartKey = exclusiveStartKey;
    }

    var response = await dynamoDb.ScanAsync(scanRequest);
    allMembers.AddRange(response.Items);

    exclusiveStartKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;

    Console.WriteLine($"Scanned {allMembers.Count} members so far...");

} while (exclusiveStartKey != null);

Console.WriteLine($"Total members found: {allMembers.Count}");

// Group by receipt_id
var groupedByReceipt = allMembers
    .GroupBy(m => m.GetValueOrDefault("receipt_id")?.S ?? "")
    .Where(g => !string.IsNullOrEmpty(g.Key))
    .ToList();

Console.WriteLine($"Found {groupedByReceipt.Count} receipts");

int updated = 0;
int skipped = 0;

foreach (var group in groupedByReceipt)
{
    var receiptId = group.Key;
    var members = group.ToList();

    // Sort by AddedAt to find the earliest (owner)
    var sortedMembers = members
        .OrderBy(m => m.GetValueOrDefault("added_at")?.S ?? "")
        .ToList();

    for (int i = 0; i < sortedMembers.Count; i++)
    {
        var member = sortedMembers[i];
        var pk = member.GetValueOrDefault("PK")?.S;
        var sk = member.GetValueOrDefault("SK")?.S;
        var existingRole = member.GetValueOrDefault("role")?.S;

        if (string.IsNullOrEmpty(pk) || string.IsNullOrEmpty(sk))
        {
            Console.WriteLine($"Skipping member with missing PK/SK");
            skipped++;
            continue;
        }

        // Skip if role already set
        if (!string.IsNullOrEmpty(existingRole))
        {
            Console.WriteLine($"Skipping {pk}/{sk} - role already set to '{existingRole}'");
            skipped++;
            continue;
        }

        // First member (earliest AddedAt) is owner, others are editor
        var role = i == 0 ? "owner" : "editor";

        try
        {
            var updateRequest = new UpdateItemRequest
            {
                TableName = TABLE_NAME,
                Key = new Dictionary<string, AttributeValue>
                {
                    { "PK", new AttributeValue(pk) },
                    { "SK", new AttributeValue(sk) }
                },
                UpdateExpression = "SET #role = :role",
                ExpressionAttributeNames = new Dictionary<string, string>
                {
                    { "#role", "role" }
                },
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    { ":role", new AttributeValue(role) }
                }
            };

            await dynamoDb.UpdateItemAsync(updateRequest);
            updated++;
            Console.WriteLine($"Updated {pk}/{sk} -> role: {role}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error updating {pk}/{sk}: {ex.Message}");
        }
    }
}

Console.WriteLine();
Console.WriteLine("Migration complete!");
Console.WriteLine($"Updated: {updated}");
Console.WriteLine($"Skipped: {skipped}");
Console.WriteLine($"Total: {updated + skipped}");
