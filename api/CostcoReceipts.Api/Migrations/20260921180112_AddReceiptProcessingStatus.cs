using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptProcessingStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProcessingStatus",
                table: "receipts",
                type: "varchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "completed")
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProcessingStatus",
                table: "receipts");
        }
    }
}
