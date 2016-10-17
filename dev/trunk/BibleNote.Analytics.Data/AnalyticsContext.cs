using BibleNote.Analytics.Data.Entities;
using System.Data.Entity;

namespace BibleNote.Analytics.Data
{
    public class AnalyticsContext : DbContext
    {
        public IDbSet<Document> Documents { get; set; }

        public IDbSet<DocumentFolder> DocumentFolders { get; set; }

        public IDbSet<DocumentParagraph> DocumentParagraphs { get; set; }

        public IDbSet<VerseEntry> VerseEntries { get; set; }

        public IDbSet<VerseRelation> VerseRelations { get; set; }

        public AnalyticsContext()
            :base("BibleNote.Analytics")
        {

        }
    }
}
