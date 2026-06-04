using CostcoReceipts.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Receipt> Receipts => Set<Receipt>();
    public DbSet<ReceiptItem> ReceiptItems => Set<ReceiptItem>();
    public DbSet<ReceiptItemAssignment> ReceiptItemAssignments => Set<ReceiptItemAssignment>();
    public DbSet<ReceiptMember> ReceiptMembers => Set<ReceiptMember>();
    public DbSet<ReceiptGeometry> ReceiptGeometries => Set<ReceiptGeometry>();
    public DbSet<ReceiptShare> ReceiptShares => Set<ReceiptShare>();
    public DbSet<PlaceholderUser> PlaceholderUsers => Set<PlaceholderUser>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Receipt>(e =>
        {
            e.ToTable("receipts");
            e.HasKey(x => x.ReceiptId);
            e.Property(x => x.ReceiptId).HasMaxLength(64);
            e.Property(x => x.OwnerUserId).HasMaxLength(128).IsRequired();
            e.HasIndex(x => x.OwnerUserId);
        });

        b.Entity<ReceiptItem>(e =>
        {
            e.ToTable("receipt_items");
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptId).HasMaxLength(64).IsRequired();
            e.Property(x => x.ItemName).HasMaxLength(512).IsRequired();
            e.Property(x => x.ItemNumber).HasMaxLength(64);
            e.Property(x => x.Price).HasPrecision(10, 2);
            e.Property(x => x.Discount).HasPrecision(10, 2);
            e.HasIndex(x => new { x.ReceiptId, x.ItemIndex }).IsUnique();
            e.HasOne(x => x.Receipt)
                .WithMany(r => r.Items)
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ReceiptItemAssignment>(e =>
        {
            e.ToTable("receipt_item_assignments");
            e.HasKey(x => new { x.ReceiptItemId, x.UserId });
            e.Property(x => x.UserId).HasMaxLength(128).IsRequired();
            e.HasOne(x => x.ReceiptItem)
                .WithMany(i => i.Assignments)
                .HasForeignKey(x => x.ReceiptItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ReceiptMember>(e =>
        {
            e.ToTable("receipt_members");
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptId).HasMaxLength(64).IsRequired();
            e.Property(x => x.UserId).HasMaxLength(128).IsRequired();
            e.Property(x => x.PlaceholderId).HasMaxLength(64);
            e.Property(x => x.UserType).HasMaxLength(32).IsRequired();
            e.Property(x => x.Role).HasMaxLength(32).IsRequired().HasDefaultValue("editor");
            e.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.AddedBy).HasMaxLength(128).IsRequired();
            e.Property(x => x.ValidationStatus).HasMaxLength(32);
            e.Property(x => x.ValidatedBy).HasMaxLength(128);
            e.Property(x => x.Comments).HasMaxLength(2048);
            e.HasIndex(x => new { x.ReceiptId, x.UserId }).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.Receipt)
                .WithMany(r => r.Members)
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ReceiptGeometry>(e =>
        {
            e.ToTable("receipt_geometry");
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptId).HasMaxLength(64).IsRequired();
            e.Property(x => x.FieldName).HasMaxLength(64).IsRequired();
            e.Property(x => x.FieldType).HasMaxLength(32).IsRequired();
            e.Property(x => x.Text).HasMaxLength(512).IsRequired();
            e.Property(x => x.PolygonJson).HasColumnType("json").IsRequired();
            e.HasIndex(x => new { x.ReceiptId, x.FieldName, x.FieldType }).IsUnique();
            e.HasOne(x => x.Receipt)
                .WithMany(r => r.Geometry)
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ReceiptShare>(e =>
        {
            e.ToTable("receipt_shares");
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptId).HasMaxLength(64).IsRequired();
            e.Property(x => x.ShareToken).HasMaxLength(128).IsRequired();
            e.Property(x => x.OwnerUserId).HasMaxLength(128).IsRequired();
            e.HasIndex(x => x.ShareToken).IsUnique();
            e.HasIndex(x => x.ReceiptId);
            e.HasOne(x => x.Receipt)
                .WithMany(r => r.Shares)
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PlaceholderUser>(e =>
        {
            e.ToTable("placeholder_users");
            e.HasKey(x => new { x.PlaceholderId, x.ReceiptId });
            e.Property(x => x.PlaceholderId).HasMaxLength(64);
            e.Property(x => x.ReceiptId).HasMaxLength(64);
            e.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
            e.Property(x => x.Status).HasMaxLength(32).IsRequired();
        });
    }
}
