using BibleNote.Analytics.Data.Entities;
using System.Data.Entity;

namespace BibleNote.Analytics.Data
{
    public class AnalyticsContext : DbContext
    {
        public IDbSet<Document> Documents { get; set; }
        public IDbSet<DocumentFolder> DocumentFolders { get; set; }        

        public AnalyticsContext()
            :base("BibleNote.Analytics")
        {

        }
    }
}
