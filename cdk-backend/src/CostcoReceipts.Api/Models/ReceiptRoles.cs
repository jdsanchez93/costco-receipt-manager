namespace CostcoReceipts.Api.Models;

/// <summary>
/// Constants and helper methods for receipt member roles.
/// </summary>
public static class ReceiptRoles
{
    /// <summary>Full administrative control - can delete receipt, manage members, revoke shares.</summary>
    public const string Owner = "owner";

    /// <summary>Can modify data (assignments, validation, create shares) but cannot manage members.</summary>
    public const string Editor = "editor";

    /// <summary>All valid roles in order of privilege (highest to lowest).</summary>
    public static readonly string[] AllRoles = { Owner, Editor };

    /// <summary>Check if the role allows editing (assignments, validation, shares).</summary>
    public static bool CanEdit(string? role) => role == Owner || role == Editor;

    /// <summary>Check if the role allows administrative actions (manage members, delete receipt).</summary>
    public static bool CanAdmin(string? role) => role == Owner;

    /// <summary>Check if the provided role is valid.</summary>
    public static bool IsValid(string? role) => role is Owner or Editor;
}
