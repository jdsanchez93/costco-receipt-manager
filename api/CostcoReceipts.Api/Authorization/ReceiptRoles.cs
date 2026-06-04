namespace CostcoReceipts.Api.Authorization;

/// <summary>
/// Constants and helpers for receipt member roles.
/// </summary>
public static class ReceiptRoles
{
    /// <summary>Full administrative control: delete receipt, manage members, manage shares.</summary>
    public const string Owner = "owner";

    /// <summary>Can modify receipt data (assignments, validation, create shares) but not manage members.</summary>
    public const string Editor = "editor";

    /// <summary>All valid roles in order of privilege (highest to lowest).</summary>
    public static readonly string[] All = [Owner, Editor];

    /// <summary>True if the role allows editing receipt data.</summary>
    public static bool CanEdit(string? role) => role is Owner or Editor;

    /// <summary>True if the role allows administrative actions on the receipt.</summary>
    public static bool CanAdmin(string? role) => role == Owner;

    /// <summary>True if the role is a recognized value.</summary>
    public static bool IsValid(string? role) => role is Owner or Editor;
}

/// <summary>
/// Names of registered authorization policies. Use these instead of stringly-typed
/// policy names on [Authorize(Policy = ...)] attributes.
/// </summary>
public static class ReceiptPolicies
{
    /// <summary>Any member of the receipt (owner or editor).</summary>
    public const string Member = "ReceiptMember";

    /// <summary>Members who can modify data (owner or editor).</summary>
    public const string Editor = "ReceiptEditor";

    /// <summary>Owner only.</summary>
    public const string Owner = "ReceiptOwner";
}
