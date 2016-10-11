using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("DocumentHierarchies")]
    public class DocumentHierarchy      // todo: а нужна ли эта сущность вообще?
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int DocumentHierarchyId { get; set; }

        [Required]
        public int DocumentId { get; set; }

        public int ParentDocumentHierarchyId { get; set; }

        [ForeignKey("DocumentId")]
        public virtual Document Document { get; set; }        

        [ForeignKey("ParentDocumentHierarchyId")]
        public virtual DocumentHierarchy ParentDocumentHierarchy { get; set; }
    }
}
