using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("VerseEntries")]
    public class VerseRelation
    {
        [Key, Column(Order = 0)]
        public long VerseId { get; set; }

        [Key, Column(Order = 1)]
        public long RelativeVerseId { get; set; }

        [Key, Column(Order = 2)]
        public int DocumentId { get; set; }

        [Key, Column(Order = 3)]
        public int DocumentParagraphId { get; set; }        

        public decimal RelationWeight { get; set; }

        [ForeignKey("DocumentId")]
        public virtual Document Document { get; set; }

        [ForeignKey("DocumentParagraphId")]
        public virtual DocumentParagraph DocumentParagraph { get; set; }
    }
}
