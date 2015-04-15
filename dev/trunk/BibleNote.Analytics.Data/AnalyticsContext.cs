using BibleNote.Analytics.Models.Entities;
using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

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
