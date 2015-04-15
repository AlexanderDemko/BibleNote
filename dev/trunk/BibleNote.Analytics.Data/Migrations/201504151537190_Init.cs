namespace BibleNote.Analytics.Data.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class Init : DbMigration
    {
        public override void Up()
        {
            CreateTable(
                "dbo.DocumentFolders",
                c => new
                    {
                        DocumentFolderId = c.Int(nullable: false, identity: true),
                        Name = c.String(nullable: false, maxLength: 4000),
                    })
                .PrimaryKey(t => t.DocumentFolderId);
            
            CreateTable(
                "dbo.Documents",
                c => new
                    {
                        DocumentId = c.Int(nullable: false, identity: true),
                        Name = c.String(nullable: false, maxLength: 4000),
                        Folder_DocumentFolderId = c.Int(),
                    })
                .PrimaryKey(t => t.DocumentId)
                .ForeignKey("dbo.DocumentFolders", t => t.Folder_DocumentFolderId)
                .Index(t => t.Folder_DocumentFolderId);
            
        }
        
        public override void Down()
        {
            DropForeignKey("dbo.Documents", "Folder_DocumentFolderId", "dbo.DocumentFolders");
            DropIndex("dbo.Documents", new[] { "Folder_DocumentFolderId" });
            DropTable("dbo.Documents");
            DropTable("dbo.DocumentFolders");
        }
    }
}
