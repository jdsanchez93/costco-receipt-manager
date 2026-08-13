using CostcoReceipts.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Receipt> Receipts => Set<Receipt>();
    public DbSet<ReceiptItem> ReceiptItems => Set<ReceiptItem>();
    public DbSet<ReceiptItemAssignment> ReceiptItemAssignments => Set<ReceiptItemAssignment>();
    public DbSet<ReceiptMember> ReceiptMembers => Set<ReceiptMember>();
    public DbSet<ReceiptGeometry> ReceiptGeometries => Set<ReceiptGeometry>();
    public DbSet<ReceiptShare> ReceiptShares => Set<ReceiptShare>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasMaxLength(128);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
            e.HasIndex(x => x.Email);
        });

        b.Entity<Contact>(e =>
        {
            e.ToTable("contacts");
            e.HasKey(x => x.ContactId);
            e.Property(x => x.OwnerUserId).HasMaxLength(128).IsRequired();
            e.Property(x => x.UserId).HasMaxLength(128);
            e.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
            e.Property(x => x.Email).HasMaxLength(256);

            // One entry per (owner, auth-user). MySQL treats NULL UserId as
            // distinct, so multiple placeholder contacts with the same owner
            // are allowed automatically.
            e.HasIndex(x => new { x.OwnerUserId, x.UserId }).IsUnique();

            e.HasOne(x => x.Owner)
                .WithMany(u => u.ContactsOwnedByMe)
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.User)
                .WithMany(u => u.ContactsThatAreMe)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Receipt>(e =>
        {
            e.ToTable("receipts");
            e.HasKey(x => x.ReceiptId);
            e.Property(x => x.ReceiptId).HasMaxLength(64);
            e.Property(x => x.OwnerUserId).HasMaxLength(128).IsRequired();
            e.HasIndex(x => x.OwnerUserId);
            e.HasOne(x => x.Owner)
                .WithMany()
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
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
            e.HasKey(x => new { x.ReceiptItemId, x.ReceiptMemberId });
            e.HasOne(x => x.ReceiptItem)
                .WithMany(i => i.Assignments)
                .HasForeignKey(x => x.ReceiptItemId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ReceiptMember)
                .WithMany(m => m.Assignments)
                .HasForeignKey(x => x.ReceiptMemberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ReceiptMember>(e =>
        {
            e.ToTable("receipt_members");
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptId).HasMaxLength(64).IsRequired();
            e.Property(x => x.Role).HasMaxLength(32).IsRequired().HasDefaultValue("editor");
            e.Property(x => x.ValidationStatus).HasMaxLength(32);
            e.Property(x => x.Comments).HasMaxLength(2048);

            // A contact appears at most once per receipt.
            e.HasIndex(x => new { x.ReceiptId, x.ContactId }).IsUnique();
            e.HasIndex(x => x.ContactId);

            e.HasOne(x => x.Receipt)
                .WithMany(r => r.Members)
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Contact)
                .WithMany(c => c.Memberships)
                .HasForeignKey(x => x.ContactId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.AddedByMember)
                .WithMany()
                .HasForeignKey(x => x.AddedByMemberId)
                .OnDelete(DeleteBehavior.SetNull);
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
            e.HasOne(x => x.Owner)
                .WithMany()
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
