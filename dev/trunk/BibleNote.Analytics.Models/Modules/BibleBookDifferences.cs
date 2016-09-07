using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Serialization;

namespace BibleNote.Analytics.Models.Modules
{
    [Serializable]
    public class BibleBookDifferences
    {
        [XmlAttribute]
        public int BookIndex { get; set; }

        [XmlElement(typeof(BibleBookDifference), ElementName = "Difference")]
        public List<BibleBookDifference> Differences { get; set; }

        public BibleBookDifferences()
        {
            this.Differences = new List<BibleBookDifference>();
        }

        public BibleBookDifferences(int bookIndex, params BibleBookDifference[] bibleBookDifferences)
            : this()
        {
            this.BookIndex = bookIndex;
            this.Differences.AddRange(bibleBookDifferences);
        }
    }
}
