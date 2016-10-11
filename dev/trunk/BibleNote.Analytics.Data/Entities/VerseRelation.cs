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

        [Key, Column(Order = 1), Index("IX_RelativeVerseId")]
        public long RelativeVerseId { get; set; }        

        [Key, Column(Order = 3)]
        public int DocumentParagraphId { get; set; }

        [Key, Column(Order = 4), ]
        public int RelativeDocumentParagraphId { get; set; }

        public decimal RelationWeight { get; set; }        

        [ForeignKey("DocumentParagraphId")]
        public virtual DocumentParagraph DocumentParagraph { get; set; }

        [ForeignKey("RelativeDocumentParagraphId")]
        public virtual DocumentParagraph RelativeDocumentParagraph { get; set; }
    }
}
