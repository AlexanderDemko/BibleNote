﻿namespace BibleNote.Domain.Entities
{
    public class VerseEntry
    {
        public int Id { get; set; }

        public long VerseId { get; set; }
        
        public decimal Weight { get; set; }

        public string Suffix { get; set; }

        public int DocumentParagraphId { get; set; }        

        public virtual DocumentParagraph DocumentParagraph { get; set; }
    }
}
