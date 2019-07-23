using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Serialization;

namespace BibleNote.Analytics.Models.Modules
{
    [Serializable]
    public class BibleStructureInfo
    {
        private static readonly object _locker = new object();

        [XmlAttribute]
        [DefaultValue("")]
        //[Obsolete()]  если пометить - то перестанут значения считываться из XML файла
        public string OldTestamentName { get; set; }

        [XmlAttribute]
        [DefaultValue(0)]
        //[Obsolete()]
        public int OldTestamentBooksCount { get; set; }

        [XmlAttribute]
        [DefaultValue("")]
        //[Obsolete()]
        public string NewTestamentName { get; set; }

        [XmlAttribute]
        [DefaultValue(0)]
        //[Obsolete()]
        public int NewTestamentBooksCount { get; set; }

        [XmlAttribute]
        public string Alphabet { get; set; }  // символы, встречающиеся в названии книг Библии                    

        [XmlAttribute]
        public string ChapterPageNameTemplate { get; set; }

        [XmlElement(typeof(BibleBookInfo), ElementName = "BibleBook")]
        public List<BibleBookInfo> BibleBooks { get; set; }

        public BibleStructureInfo()
        {
            this.BibleBooks = new List<BibleBookInfo>();
        }

        private Dictionary<string, Abbreviation> _allAbbreviations;
        [XmlIgnore, JsonIgnore]
        public Dictionary<string, Abbreviation> AllAbbreviations
        {
            get
            {
                if (_allAbbreviations == null)
                {
                    lock (_locker)
                    {
                        if (_allAbbreviations == null)
                            _allAbbreviations = GetAllAbbreviations();
                    }
                }

                return _allAbbreviations;
            }
        }

        private Dictionary<string, Abbreviation> GetAllAbbreviations()
        {
            var result = new Dictionary<string, Abbreviation>(StringComparer.OrdinalIgnoreCase);

            foreach (var bibleBook in BibleBooks)
            {
                foreach (var abbKVP in bibleBook.AllAbbreviations)
                {
                    result.Add(abbKVP.Key, abbKVP.Value);
                }
            }

            return result;
        }
    }
}
