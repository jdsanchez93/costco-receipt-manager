using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class ContactsRefactor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "placeholder_users");

            // MySQL uses the composite (ReceiptId, UserId) index as the supporting
            // index for the receipt_members -> receipts FK (ReceiptId is leftmost).
            // Dropping that index directly fails with "needed in a foreign key
            // constraint", so we drop and later re-add the FK around the schema
            // changes. EF's scaffolder didn't generate these calls automatically.
            migrationBuilder.DropForeignKey(
                name: "FK_receipt_members_receipts_ReceiptId",
                table: "receipt_members");

            migrationBuilder.DropIndex(
                name: "IX_receipt_members_ReceiptId_UserId",
                table: "receipt_members");

            migrationBuilder.DropIndex(
                name: "IX_receipt_members_UserId",
                table: "receipt_members");

            // Same MySQL FK-index-dependency issue as above, but for
            // receipt_item_assignments -> receipt_items: the composite PK
            // (ReceiptItemId, UserId) doubles as the FK's supporting index.
            migrationBuilder.DropForeignKey(
                name: "FK_receipt_item_assignments_receipt_items_ReceiptItemId",
                table: "receipt_item_assignments");

            migrationBuilder.DropPrimaryKey(
                name: "PK_receipt_item_assignments",
                table: "receipt_item_assignments");

            migrationBuilder.DropColumn(
                name: "AddedBy",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "DisplayName",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "PlaceholderId",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "UserType",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "ValidatedBy",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "receipt_item_assignments");

            migrationBuilder.AddColumn<long>(
                name: "AddedByMemberId",
                table: "receipt_members",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ContactId",
                table: "receipt_members",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "ReceiptMemberId",
                table: "receipt_item_assignments",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddPrimaryKey(
                name: "PK_receipt_item_assignments",
                table: "receipt_item_assignments",
                columns: new[] { "ReceiptItemId", "ReceiptMemberId" });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Email = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DisplayName = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.UserId);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "contacts",
                columns: table => new
                {
                    ContactId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OwnerUserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    UserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DisplayName = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Email = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_contacts", x => x.ContactId);
                    table.ForeignKey(
                        name: "FK_contacts_users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "users",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_contacts_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_shares_OwnerUserId",
                table: "receipt_shares",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_AddedByMemberId",
                table: "receipt_members",
                column: "AddedByMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_ContactId",
                table: "receipt_members",
                column: "ContactId");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_ReceiptId_ContactId",
                table: "receipt_members",
                columns: new[] { "ReceiptId", "ContactId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_item_assignments_ReceiptMemberId",
                table: "receipt_item_assignments",
                column: "ReceiptMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_contacts_OwnerUserId_UserId",
                table: "contacts",
                columns: new[] { "OwnerUserId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_contacts_UserId",
                table: "contacts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_users_Email",
                table: "users",
                column: "Email");

            migrationBuilder.AddForeignKey(
                name: "FK_receipt_item_assignments_receipt_members_ReceiptMemberId",
                table: "receipt_item_assignments",
                column: "ReceiptMemberId",
                principalTable: "receipt_members",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_receipt_members_contacts_ContactId",
                table: "receipt_members",
                column: "ContactId",
                principalTable: "contacts",
                principalColumn: "ContactId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_receipt_members_receipt_members_AddedByMemberId",
                table: "receipt_members",
                column: "AddedByMemberId",
                principalTable: "receipt_members",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_receipt_shares_users_OwnerUserId",
                table: "receipt_shares",
                column: "OwnerUserId",
                principalTable: "users",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_receipts_users_OwnerUserId",
                table: "receipts",
                column: "OwnerUserId",
                principalTable: "users",
                principalColumn: "UserId",
                onDelete: ReferentialAction.Restrict);

            // Re-add the receipt_members -> receipts FK dropped at the top of Up().
            migrationBuilder.AddForeignKey(
                name: "FK_receipt_members_receipts_ReceiptId",
                table: "receipt_members",
                column: "ReceiptId",
                principalTable: "receipts",
                principalColumn: "ReceiptId",
                onDelete: ReferentialAction.Cascade);

            // Re-add the receipt_item_assignments -> receipt_items FK.
            migrationBuilder.AddForeignKey(
                name: "FK_receipt_item_assignments_receipt_items_ReceiptItemId",
                table: "receipt_item_assignments",
                column: "ReceiptItemId",
                principalTable: "receipt_items",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_receipt_item_assignments_receipt_members_ReceiptMemberId",
                table: "receipt_item_assignments");

            migrationBuilder.DropForeignKey(
                name: "FK_receipt_members_contacts_ContactId",
                table: "receipt_members");

            migrationBuilder.DropForeignKey(
                name: "FK_receipt_members_receipt_members_AddedByMemberId",
                table: "receipt_members");

            migrationBuilder.DropForeignKey(
                name: "FK_receipt_shares_users_OwnerUserId",
                table: "receipt_shares");

            migrationBuilder.DropForeignKey(
                name: "FK_receipts_users_OwnerUserId",
                table: "receipts");

            migrationBuilder.DropTable(
                name: "contacts");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropIndex(
                name: "IX_receipt_shares_OwnerUserId",
                table: "receipt_shares");

            migrationBuilder.DropIndex(
                name: "IX_receipt_members_AddedByMemberId",
                table: "receipt_members");

            migrationBuilder.DropIndex(
                name: "IX_receipt_members_ContactId",
                table: "receipt_members");

            migrationBuilder.DropIndex(
                name: "IX_receipt_members_ReceiptId_ContactId",
                table: "receipt_members");

            migrationBuilder.DropPrimaryKey(
                name: "PK_receipt_item_assignments",
                table: "receipt_item_assignments");

            migrationBuilder.DropIndex(
                name: "IX_receipt_item_assignments_ReceiptMemberId",
                table: "receipt_item_assignments");

            migrationBuilder.DropColumn(
                name: "AddedByMemberId",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "ContactId",
                table: "receipt_members");

            migrationBuilder.DropColumn(
                name: "ReceiptMemberId",
                table: "receipt_item_assignments");

            migrationBuilder.AddColumn<string>(
                name: "AddedBy",
                table: "receipt_members",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "DisplayName",
                table: "receipt_members",
                type: "varchar(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "receipt_members",
                type: "varchar(256)",
                maxLength: 256,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "PlaceholderId",
                table: "receipt_members",
                type: "varchar(64)",
                maxLength: 64,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "receipt_members",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "UserType",
                table: "receipt_members",
                type: "varchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "ValidatedBy",
                table: "receipt_members",
                type: "varchar(128)",
                maxLength: 128,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "receipt_item_assignments",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddPrimaryKey(
                name: "PK_receipt_item_assignments",
                table: "receipt_item_assignments",
                columns: new[] { "ReceiptItemId", "UserId" });

            migrationBuilder.CreateTable(
                name: "placeholder_users",
                columns: table => new
                {
                    PlaceholderId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    DisplayName = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Status = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placeholder_users", x => new { x.PlaceholderId, x.ReceiptId });
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_ReceiptId_UserId",
                table: "receipt_members",
                columns: new[] { "ReceiptId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_UserId",
                table: "receipt_members",
                column: "UserId");
        }
    }
}
