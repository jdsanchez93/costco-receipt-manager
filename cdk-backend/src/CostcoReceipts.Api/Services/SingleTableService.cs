using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using CostcoReceipts.Api.Configuration;
using CostcoReceipts.Api.Models;
using System.Text.Json;

namespace CostcoReceipts.Api.Services;

public class SingleTableService : ISingleTableService
{
    private readonly IAmazonDynamoDB _dynamoDb;
    private readonly string _tableName;
    private readonly ILogger<SingleTableService> _logger;

    public SingleTableService(IAmazonDynamoDB dynamoDb, ILogger<SingleTableService> logger)
    {
        _dynamoDb = dynamoDb;
        _tableName = DynamoDbConfiguration.MainTableName;
        _logger = logger;
    }

    // User Receipts Methods
    public async Task<List<ReceiptMember>> GetUserReceiptsAsync(string userId)
    {
        _logger.LogInformation("Getting user receipts for userId: {UserId}", userId);

        var request = new QueryRequest
        {
            TableName = _tableName,
            IndexName = DynamoDbConfiguration.GSI.GSI1,
            KeyConditionExpression = "GSI1PK = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"USER#{userId}") }
            }
        };

        try
        {
            var response = await _dynamoDb.QueryAsync(request);
            var items = response.Items.Select(ConvertToReceiptMember).ToList();
            
            _logger.LogInformation("Successfully retrieved {Count} user receipts", items.Count);
            return items;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user receipts for userId: {UserId}", userId);
            throw;
        }
    }

    // Receipt Items Methods
    public async Task<List<ReceiptItem>> GetReceiptItemsAsync(string receiptId)
    {
        _logger.LogInformation("Getting receipt items for receiptId: {ReceiptId}", receiptId);

        var request = new QueryRequest
        {
            TableName = _tableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"RECEIPT#{receiptId}") },
                { ":sk_prefix", new AttributeValue("ITEM#") }
            }
        };

        try
        {
            var response = await _dynamoDb.QueryAsync(request);
            var items = response.Items.Select(ConvertToReceiptItem).ToList();
            
            _logger.LogInformation("Successfully retrieved {Count} receipt items", items.Count);
            return items;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting receipt items for receiptId: {ReceiptId}", receiptId);
            throw;
        }
    }

    public async Task<ReceiptItem> CreateReceiptItemAsync(string receiptId, ReceiptItem item)
    {
        var itemId = item.ItemNumber ?? Guid.NewGuid().ToString();
        var receiptItem = new ReceiptItem
        {
            PK = $"RECEIPT#{receiptId}",
            SK = $"ITEM#{itemId}",
            EntityType = DynamoDbConfiguration.EntityTypes.ReceiptItem,
            ReceiptId = receiptId,
            CreatedAt = DateTime.UtcNow.ToString("O"),
            ItemNumber = item.ItemNumber,
            ItemName = item.ItemName,
            Price = item.Price,
            Discount = item.Discount,
            AssignedUsers = item.AssignedUsers
        };

        var request = new PutItemRequest
        {
            TableName = _tableName,
            Item = ConvertToAttributeValues(receiptItem),
            ConditionExpression = "attribute_not_exists(PK) AND attribute_not_exists(SK)"
        };

        await _dynamoDb.PutItemAsync(request);
        return receiptItem;
    }

    // Receipt Members Methods
    public async Task<List<ReceiptMember>> GetReceiptMembersAsync(string receiptId)
    {
        _logger.LogInformation("Getting receipt members for receiptId: {ReceiptId}", receiptId);

        var request = new QueryRequest
        {
            TableName = _tableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"RECEIPT#{receiptId}") },
                { ":sk_prefix", new AttributeValue("USER#") }
            }
        };

        try
        {
            var response = await _dynamoDb.QueryAsync(request);
            var members = response.Items.Select(ConvertToReceiptMember).ToList();
            
            _logger.LogInformation("Successfully retrieved {Count} receipt members", members.Count);
            return members;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting receipt members for receiptId: {ReceiptId}", receiptId);
            throw;
        }
    }

    public async Task<ReceiptMember> CreateReceiptMemberAsync(string receiptId, string userId, string displayName, 
        string? email, string addedByUserId, string userType = "authenticated")
    {
        _logger.LogInformation("Creating receipt member: receiptId={ReceiptId}, userId={UserId}, userType={UserType}", 
            receiptId, userId, userType);

        var member = new ReceiptMember
        {
            PK = $"RECEIPT#{receiptId}",
            SK = $"USER#{userId}",
            GSI1PK = $"USER#{userId}",
            GSI1SK = $"RECEIPT#{receiptId}",
            EntityType = DynamoDbConfiguration.EntityTypes.ReceiptMember,
            ReceiptId = receiptId,
            UserId = userId,
            PlaceholderId = userType == "placeholder" ? userId : null,
            UserType = userType,
            DisplayName = displayName,
            Email = email,
            AddedBy = addedByUserId,
            AddedAt = DateTime.UtcNow.ToString("O")
        };

        var request = new PutItemRequest
        {
            TableName = _tableName,
            Item = ConvertToAttributeValues(member)
        };

        await _dynamoDb.PutItemAsync(request);
        _logger.LogInformation("Successfully created receipt member");
        return member;
    }

    public async Task UpdateMemberDetailsAsync(string receiptId, string userId, string displayName, string email)
    {
        _logger.LogInformation("Updating member details: receiptId={ReceiptId}, userId={UserId}", receiptId, userId);

        var request = new UpdateItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                { "PK", new AttributeValue($"RECEIPT#{receiptId}") },
                { "SK", new AttributeValue($"USER#{userId}") }
            },
            UpdateExpression = "SET display_name = :displayName, email = :email, updated_at = :updatedAt",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":displayName", new AttributeValue(displayName) },
                { ":email", new AttributeValue(email) },
                { ":updatedAt", new AttributeValue(DateTime.UtcNow.ToString("O")) },
                { ":emptyString", new AttributeValue("") }
            },
            ConditionExpression = "attribute_exists(PK) AND attribute_exists(SK) AND (attribute_not_exists(display_name) OR display_name = :emptyString)"
        };

        try
        {
            await _dynamoDb.UpdateItemAsync(request);
            _logger.LogInformation("Successfully updated member details");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating member details");
            throw;
        }
    }

    // Item Assignment Methods
    public async Task UpdateItemAssignmentAsync(string receiptId, string itemId, List<string> assignedUsers)
    {
        _logger.LogInformation("Updating item assignment: receiptId={ReceiptId}, itemId={ItemId}, userCount={UserCount}", 
            receiptId, itemId, assignedUsers.Count);

        var request = new UpdateItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                { "PK", new AttributeValue($"RECEIPT#{receiptId}") },
                { "SK", new AttributeValue($"ITEM#{itemId.PadLeft(3, '0')}") }
            },
            UpdateExpression = "SET assigned_users = :users, updated_at = :updatedAt",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":users", new AttributeValue { SS = assignedUsers } },
                { ":updatedAt", new AttributeValue(DateTime.UtcNow.ToString("O")) }
            }
        };

        await _dynamoDb.UpdateItemAsync(request);
        _logger.LogInformation("Successfully updated item assignment");
    }

    public async Task BulkUpdateItemAssignmentsAsync(string receiptId, List<(string ItemId, List<string> AssignedUsers)> updates)
    {
        _logger.LogInformation("Bulk updating item assignments: receiptId={ReceiptId}, updateCount={UpdateCount}", 
            receiptId, updates.Count);

        var tasks = updates.Select(update => 
            UpdateItemAssignmentAsync(receiptId, update.ItemId, update.AssignedUsers));

        await Task.WhenAll(tasks);
        _logger.LogInformation("Successfully completed bulk update");
    }

    public async Task ClearAllItemAssignmentsAsync(string receiptId)
    {
        _logger.LogInformation("Clearing all item assignments for receiptId: {ReceiptId}", receiptId);

        var items = await GetReceiptItemsAsync(receiptId);
        var updates = items.Select(item => (
            ItemId: item.SK.Replace("ITEM#", ""),
            AssignedUsers: new List<string>()
        )).ToList();

        await BulkUpdateItemAssignmentsAsync(receiptId, updates);
        _logger.LogInformation("Successfully cleared all assignments for {ItemCount} items", items.Count);
    }

    // Receipt Validation Methods
    public async Task ValidateReceiptSubtotalAsync(string receiptId, string userId, string validationStatus, 
        decimal? validatedAmount, string? comments)
    {
        _logger.LogInformation("Validating receipt subtotal: receiptId={ReceiptId}, userId={UserId}, status={Status}", 
            receiptId, userId, validationStatus);

        var request = new UpdateItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                { "PK", new AttributeValue($"RECEIPT#{receiptId}") },
                { "SK", new AttributeValue($"USER#{userId}") }
            },
            UpdateExpression = "SET validationStatus = :status, validatedAmount = :amount, validationComments = :comments, validatedAt = :validatedAt",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":status", new AttributeValue(validationStatus) },
                { ":amount", validatedAmount.HasValue ? new AttributeValue { N = validatedAmount.Value.ToString() } : new AttributeValue { NULL = true } },
                { ":comments", new AttributeValue(comments ?? "") },
                { ":validatedAt", new AttributeValue(DateTime.UtcNow.ToString("O")) }
            }
        };

        await _dynamoDb.UpdateItemAsync(request);
        _logger.LogInformation("Successfully validated receipt");
    }

    // Receipt Sharing Methods
    public async Task<ReceiptShare> CreateReceiptShareAsync(string receiptId, string userId, int expiresInDays = 30)
    {
        _logger.LogInformation("Creating receipt share: receiptId={ReceiptId}, userId={UserId}, expiresInDays={ExpiresInDays}", 
            receiptId, userId, expiresInDays);

        var shareToken = Guid.NewGuid().ToString();
        var createdAt = DateTime.UtcNow;
        var expiresAt = createdAt.AddDays(expiresInDays);
        var expiresAtTimestamp = ((DateTimeOffset)expiresAt).ToUnixTimeSeconds();

        var share = new ReceiptShare
        {
            PK = $"SHARE#{shareToken}",
            SK = $"RECEIPT#{receiptId}",
            GSI2PK = $"RECEIPT#{receiptId}",
            GSI2SK = $"SHARE#{shareToken}",
            EntityType = DynamoDbConfiguration.EntityTypes.ReceiptShare,
            ReceiptId = receiptId,
            OwnerUserId = userId,
            ShareToken = shareToken,
            CreatedAt = createdAt.ToString("O"),
            ExpiresAt = expiresAtTimestamp,
            IsActive = true,
            CurrentUses = 0
        };

        var request = new PutItemRequest
        {
            TableName = _tableName,
            Item = ConvertToAttributeValues(share)
        };

        await _dynamoDb.PutItemAsync(request);
        _logger.LogInformation("Successfully created receipt share with token: {ShareToken}", shareToken);
        return share;
    }

    public async Task<List<ReceiptShare>> GetReceiptSharesAsync(string receiptId)
    {
        _logger.LogInformation("Getting receipt shares for receiptId: {ReceiptId}", receiptId);

        var request = new QueryRequest
        {
            TableName = _tableName,
            IndexName = DynamoDbConfiguration.GSI.GSI2,
            KeyConditionExpression = "GSI2PK = :pk AND begins_with(GSI2SK, :sk_prefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"RECEIPT#{receiptId}") },
                { ":sk_prefix", new AttributeValue("SHARE#") }
            }
        };

        var response = await _dynamoDb.QueryAsync(request);
        var shares = response.Items
            .Select(ConvertToReceiptShare)
            .Where(share => share.IsActive)
            .ToList();

        _logger.LogInformation("Successfully retrieved {Count} active shares", shares.Count);
        return shares;
    }

    public async Task<ReceiptShare?> GetSharedReceiptAsync(string shareToken)
    {
        _logger.LogInformation("Getting shared receipt for shareToken: {ShareToken}", shareToken);

        var request = new QueryRequest
        {
            TableName = _tableName,
            KeyConditionExpression = "PK = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"SHARE#{shareToken}") }
            }
        };

        var response = await _dynamoDb.QueryAsync(request);
        if (response.Items.Count == 0)
        {
            _logger.LogWarning("Share not found for token: {ShareToken}", shareToken);
            return null;
        }

        var share = ConvertToReceiptShare(response.Items[0]);

        // Check if share is still active
        if (!share.IsActive)
        {
            _logger.LogWarning("Share is inactive for token: {ShareToken}", shareToken);
            return null;
        }

        // Check if expired
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (share.ExpiresAt < now)
        {
            _logger.LogWarning("Share is expired for token: {ShareToken}", shareToken);
            return null;
        }

        _logger.LogInformation("Successfully retrieved shared receipt");
        return share;
    }

    // Receipt Geometry Methods
    public async Task<Dictionary<string, object>> GetReceiptGeometryAsync(string receiptId)
    {
        _logger.LogInformation("Getting receipt geometry for receiptId: {ReceiptId}", receiptId);

        var request = new QueryRequest
        {
            TableName = _tableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":pk", new AttributeValue($"RECEIPT#{receiptId}") },
                { ":sk_prefix", new AttributeValue("GEOMETRY#") }
            }
        };

        var response = await _dynamoDb.QueryAsync(request);
        if (response.Items.Count == 0)
        {
            _logger.LogInformation("No geometry data found for receiptId: {ReceiptId}", receiptId);
            return new Dictionary<string, object>();
        }

        // Transform geometry data to match original format
        var geometryData = new Dictionary<string, object>();
        foreach (var item in response.Items)
        {
            var geometry = ConvertToReceiptGeometry(item);
            var fieldName = geometry.FieldName.ToLower();
            var fieldType = geometry.FieldType;

            if (!geometryData.ContainsKey(fieldName))
            {
                geometryData[fieldName] = new Dictionary<string, object>();
            }

            var fieldData = (Dictionary<string, object>)geometryData[fieldName];
            fieldData[fieldType] = new
            {
                text = geometry.Text,
                confidence = geometry.Confidence,
                bounding_box = new
                {
                    Width = geometry.BoundingBox.Width,
                    Height = geometry.BoundingBox.Height,
                    Left = geometry.BoundingBox.Left,
                    Top = geometry.BoundingBox.Top
                },
                polygon = geometry.Polygon.Select(p => new { X = p.X, Y = p.Y }).ToList()
            };
        }

        _logger.LogInformation("Successfully retrieved geometry data with {FieldCount} fields", geometryData.Count);
        return geometryData;
    }

    public async Task StoreReceiptGeometryAsync(string receiptId, List<ReceiptGeometry> geometryData)
    {
        var requests = geometryData.Select(geometry => new PutItemRequest
        {
            TableName = _tableName,
            Item = ConvertToAttributeValues(geometry)
        });

        await Task.WhenAll(requests.Select(request => _dynamoDb.PutItemAsync(request)));
        _logger.LogInformation("Successfully stored {Count} geometry items", geometryData.Count);
    }

    // Helper methods for DynamoDB attribute conversion
    private static ReceiptItem ConvertToReceiptItem(Dictionary<string, AttributeValue> item)
    {
        return new ReceiptItem
        {
            PK = item.GetValueOrDefault("PK")?.S ?? "",
            SK = item.GetValueOrDefault("SK")?.S ?? "",
            EntityType = item.GetValueOrDefault("entity_type")?.S ?? "",
            ReceiptId = item.GetValueOrDefault("receipt_id")?.S ?? "",
            ItemNumber = item.GetValueOrDefault("item_number")?.S,
            ItemName = item.GetValueOrDefault("item_name")?.S ?? "",
            Price = decimal.TryParse(item.GetValueOrDefault("price")?.N, out var price) ? price : 0,
            Discount = decimal.TryParse(item.GetValueOrDefault("discount")?.N, out var discount) ? discount : null,
            AssignedUsers = item.GetValueOrDefault("assigned_users")?.SS ?? new List<string>(),
            CreatedAt = item.GetValueOrDefault("created_at")?.S ?? "",
            UpdatedAt = item.GetValueOrDefault("updated_at")?.S
        };
    }

    private static ReceiptMember ConvertToReceiptMember(Dictionary<string, AttributeValue> item)
    {
        return new ReceiptMember
        {
            PK = item.GetValueOrDefault("PK")?.S ?? "",
            SK = item.GetValueOrDefault("SK")?.S ?? "",
            GSI1PK = item.GetValueOrDefault("GSI1PK")?.S ?? "",
            GSI1SK = item.GetValueOrDefault("GSI1SK")?.S ?? "",
            EntityType = item.GetValueOrDefault("entity_type")?.S ?? "",
            ReceiptId = item.GetValueOrDefault("receipt_id")?.S ?? "",
            UserId = item.GetValueOrDefault("user_id")?.S ?? "",
            PlaceholderId = item.GetValueOrDefault("placeholder_id")?.S,
            UserType = item.GetValueOrDefault("user_type")?.S ?? "",
            DisplayName = item.GetValueOrDefault("display_name")?.S ?? "",
            Email = item.GetValueOrDefault("email")?.S,
            AddedBy = item.GetValueOrDefault("added_by")?.S ?? "",
            AddedAt = item.GetValueOrDefault("added_at")?.S ?? "",
            UpdatedAt = item.GetValueOrDefault("updated_at")?.S,
            ValidationStatus = item.GetValueOrDefault("validationStatus")?.S,
            ValidatedAmount = decimal.TryParse(item.GetValueOrDefault("validatedAmount")?.N, out var amount) ? amount : null,
            ValidationComments = item.GetValueOrDefault("validationComments")?.S,
            ValidatedAt = item.GetValueOrDefault("validatedAt")?.S
        };
    }

    private static ReceiptShare ConvertToReceiptShare(Dictionary<string, AttributeValue> item)
    {
        return new ReceiptShare
        {
            PK = item.GetValueOrDefault("PK")?.S ?? "",
            SK = item.GetValueOrDefault("SK")?.S ?? "",
            GSI2PK = item.GetValueOrDefault("GSI2PK")?.S ?? "",
            GSI2SK = item.GetValueOrDefault("GSI2SK")?.S ?? "",
            EntityType = item.GetValueOrDefault("entity_type")?.S ?? "",
            ReceiptId = item.GetValueOrDefault("receipt_id")?.S ?? "",
            OwnerUserId = item.GetValueOrDefault("owner_user_id")?.S ?? "",
            ShareToken = item.GetValueOrDefault("share_token")?.S ?? "",
            CreatedAt = item.GetValueOrDefault("created_at")?.S ?? "",
            ExpiresAt = long.TryParse(item.GetValueOrDefault("expires_at")?.N, out var expires) ? expires : 0,
            IsActive = item.GetValueOrDefault("is_active")?.BOOL ?? true,
            CurrentUses = int.TryParse(item.GetValueOrDefault("current_uses")?.N, out var uses) ? uses : 0
        };
    }

    private static ReceiptGeometry ConvertToReceiptGeometry(Dictionary<string, AttributeValue> item)
    {
        var boundingBox = new BoundingBox();
        if (item.TryGetValue("bounding_box", out var bbAttr) && bbAttr.M != null)
        {
            boundingBox.Width = double.TryParse(bbAttr.M.GetValueOrDefault("Width")?.N, out var w) ? w : 0;
            boundingBox.Height = double.TryParse(bbAttr.M.GetValueOrDefault("Height")?.N, out var h) ? h : 0;
            boundingBox.Left = double.TryParse(bbAttr.M.GetValueOrDefault("Left")?.N, out var l) ? l : 0;
            boundingBox.Top = double.TryParse(bbAttr.M.GetValueOrDefault("Top")?.N, out var t) ? t : 0;
        }

        var polygon = new List<Point>();
        if (item.TryGetValue("polygon", out var polyAttr) && polyAttr.L != null)
        {
            polygon = polyAttr.L.Select(p => new Point
            {
                X = double.TryParse(p.M?.GetValueOrDefault("X")?.N, out var x) ? x : 0,
                Y = double.TryParse(p.M?.GetValueOrDefault("Y")?.N, out var y) ? y : 0
            }).ToList();
        }

        return new ReceiptGeometry
        {
            PK = item.GetValueOrDefault("PK")?.S ?? "",
            SK = item.GetValueOrDefault("SK")?.S ?? "",
            EntityType = item.GetValueOrDefault("entity_type")?.S ?? "",
            ReceiptId = item.GetValueOrDefault("receipt_id")?.S ?? "",
            FieldName = item.GetValueOrDefault("field_name")?.S ?? "",
            FieldType = item.GetValueOrDefault("field_type")?.S ?? "",
            Text = item.GetValueOrDefault("text")?.S ?? "",
            Confidence = double.TryParse(item.GetValueOrDefault("confidence")?.N, out var conf) ? conf : 0,
            BoundingBox = boundingBox,
            Polygon = polygon,
            CreatedAt = item.GetValueOrDefault("created_at")?.S ?? ""
        };
    }

    private static Dictionary<string, AttributeValue> ConvertToAttributeValues(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        var document = JsonDocument.Parse(json);
        return ConvertJsonToAttributeValues(document.RootElement);
    }

    private static Dictionary<string, AttributeValue> ConvertJsonToAttributeValues(JsonElement element)
    {
        var attributes = new Dictionary<string, AttributeValue>();

        foreach (var property in element.EnumerateObject())
        {
            var value = ConvertJsonElementToAttributeValue(property.Value);
            if (value != null)
            {
                attributes[property.Name] = value;
            }
        }

        return attributes;
    }

    private static AttributeValue? ConvertJsonElementToAttributeValue(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                var str = element.GetString();
                return string.IsNullOrEmpty(str) ? null : new AttributeValue(str);
            
            case JsonValueKind.Number:
                return new AttributeValue { N = element.GetDouble().ToString() };
            
            case JsonValueKind.True:
            case JsonValueKind.False:
                return new AttributeValue { BOOL = element.GetBoolean() };
            
            case JsonValueKind.Array:
                var list = element.EnumerateArray()
                    .Select(ConvertJsonElementToAttributeValue)
                    .Where(v => v != null)
                    .ToList();
                return list.Count > 0 ? new AttributeValue { L = list! } : null;
            
            case JsonValueKind.Object:
                var map = new Dictionary<string, AttributeValue>();
                foreach (var prop in element.EnumerateObject())
                {
                    var value = ConvertJsonElementToAttributeValue(prop.Value);
                    if (value != null)
                    {
                        map[prop.Name] = value;
                    }
                }
                return map.Count > 0 ? new AttributeValue { M = map } : null;
            
            case JsonValueKind.Null:
            default:
                return null;
        }
    }
}