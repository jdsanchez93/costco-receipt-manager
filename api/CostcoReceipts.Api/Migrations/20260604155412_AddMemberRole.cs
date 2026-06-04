using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "receipt_members",
                type: "varchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "editor")
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Role",
                table: "receipt_members");
        }
    }
}
