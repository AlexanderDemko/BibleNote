using Microsoft.EntityFrameworkCore.Migrations;

namespace BibleNote.Persistence.Migrations
{
    public partial class DocumentFolder_AddPathIndex : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_DocumentFolders_NavigationProviderName_Path",
                table: "DocumentFolders",
                columns: new[] { "NavigationProviderName", "Path" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DocumentFolders_NavigationProviderName_Path",
                table: "DocumentFolders");
        }
    }
}
