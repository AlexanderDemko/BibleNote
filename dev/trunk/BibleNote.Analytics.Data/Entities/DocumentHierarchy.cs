using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("DocumentHierarchies")]
    public class DocumentHierarchy
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int DocumentHierarchyId { get; set; }

        [Required]
        public int DocumentId { get; set; }

        [ForeignKey("DocumentId")]
        public virtual Document Document { get; set; }

        public int ParentDocumentHierarchyId { get; set; }

        [ForeignKey("ParentDocumentHierarchyId")]
        public virtual DocumentHierarchy ParentDocumentHierarchy { get; set; }
    }
}
