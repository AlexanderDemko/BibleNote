﻿namespace BibleNote.Domain.Entities
{
    public class DocumentParagraph
    {
        public int Id { get; set; }

        public string Path { get; set; }        

        public int DocumentId { get; set; }

        public int Index { get; set; }

        public virtual Document Document { get; set; }        
    }
}
