using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("DocumentFolders")]
    public class DocumentFolder
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)] 
        public int DocumentFolderId { get; set; }

        [Required]
        public string Name { get; set; }

        [Required]
        public string Path { get; set; }

        [Required]
        public string NavigationProviderName { get; set; }

        public int? ParentFolderId { get; set; }

        [ForeignKey("ParentFolderId")]
        public DocumentFolder ParentFolder { get; set; }
    }
}
