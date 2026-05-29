using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "placeholder_users",
                columns: table => new
                {
                    PlaceholderId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DisplayName = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Status = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placeholder_users", x => new { x.PlaceholderId, x.ReceiptId });
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipts",
                columns: table => new
                {
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    OwnerUserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipts", x => x.ReceiptId);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipt_geometry",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    FieldName = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    FieldType = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Text = table.Column<string>(type: "varchar(512)", maxLength: 512, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Confidence = table.Column<double>(type: "double", nullable: false),
                    BoundingBoxWidth = table.Column<double>(type: "double", nullable: false),
                    BoundingBoxHeight = table.Column<double>(type: "double", nullable: false),
                    BoundingBoxLeft = table.Column<double>(type: "double", nullable: false),
                    BoundingBoxTop = table.Column<double>(type: "double", nullable: false),
                    PolygonJson = table.Column<string>(type: "json", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_geometry", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receipt_geometry_receipts_ReceiptId",
                        column: x => x.ReceiptId,
                        principalTable: "receipts",
                        principalColumn: "ReceiptId",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipt_items",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ItemIndex = table.Column<int>(type: "int", nullable: false),
                    ItemNumber = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ItemName = table.Column<string>(type: "varchar(512)", maxLength: 512, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Price = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receipt_items_receipts_ReceiptId",
                        column: x => x.ReceiptId,
                        principalTable: "receipts",
                        principalColumn: "ReceiptId",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipt_members",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    UserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    PlaceholderId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    UserType = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DisplayName = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Email = table.Column<string>(type: "varchar(256)", maxLength: 256, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    AddedBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    AddedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ValidationStatus = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValidatedBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValidatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    Comments = table.Column<string>(type: "varchar(2048)", maxLength: 2048, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receipt_members_receipts_ReceiptId",
                        column: x => x.ReceiptId,
                        principalTable: "receipts",
                        principalColumn: "ReceiptId",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipt_shares",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ReceiptId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ShareToken = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    OwnerUserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsActive = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    CurrentUses = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_shares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receipt_shares_receipts_ReceiptId",
                        column: x => x.ReceiptId,
                        principalTable: "receipts",
                        principalColumn: "ReceiptId",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "receipt_item_assignments",
                columns: table => new
                {
                    ReceiptItemId = table.Column<long>(type: "bigint", nullable: false),
                    UserId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_item_assignments", x => new { x.ReceiptItemId, x.UserId });
                    table.ForeignKey(
                        name: "FK_receipt_item_assignments_receipt_items_ReceiptItemId",
                        column: x => x.ReceiptItemId,
                        principalTable: "receipt_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_geometry_ReceiptId_FieldName_FieldType",
                table: "receipt_geometry",
                columns: new[] { "ReceiptId", "FieldName", "FieldType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_items_ReceiptId_ItemIndex",
                table: "receipt_items",
                columns: new[] { "ReceiptId", "ItemIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_ReceiptId_UserId",
                table: "receipt_members",
                columns: new[] { "ReceiptId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_members_UserId",
                table: "receipt_members",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_shares_ReceiptId",
                table: "receipt_shares",
                column: "ReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_shares_ShareToken",
                table: "receipt_shares",
                column: "ShareToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipts_OwnerUserId",
                table: "receipts",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "placeholder_users");

            migrationBuilder.DropTable(
                name: "receipt_geometry");

            migrationBuilder.DropTable(
                name: "receipt_item_assignments");

            migrationBuilder.DropTable(
                name: "receipt_members");

            migrationBuilder.DropTable(
                name: "receipt_shares");

            migrationBuilder.DropTable(
                name: "receipt_items");

            migrationBuilder.DropTable(
                name: "receipts");
        }
    }
}
