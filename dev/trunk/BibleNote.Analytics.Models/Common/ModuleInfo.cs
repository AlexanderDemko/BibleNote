using BibleNote.Analytics.Core.Helpers;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Serialization;

namespace BibleNote.Analytics.Models.Common
{
    public enum ModuleType
    {
        Bible = 0,
        Strong = 1,
        Dictionary = 2
        //, Book = 3...
    }    

    [Serializable]
    [XmlRoot(ElementName = "BibleNoteModule")]
    public class ModuleInfo
    {
        [XmlAttribute]
        [DefaultValue((int)ModuleType.Bible)]
        public ModuleType Type { get; set; }

        [XmlAttribute("Version")]
        [EditorBrowsable(EditorBrowsableState.Never)]
        public string XmlVersion { get; set; }

        [XmlIgnore]
        public Version Version
        {
            get
            {
                if (string.IsNullOrEmpty(XmlVersion))
                    throw new ArgumentNullException("Version");

                return new Version(XmlVersion);
            }
            set
            {
                if (value == null)
                    throw new ArgumentNullException("Version");

                XmlVersion = value.ToString();
            }
        }

        [XmlAttribute("MinProgramVersion")]
        [DefaultValue("")]
        public string XmlMinProgramVersion { get; set; }

        [XmlIgnore]
        public Version MinProgramVersion
        {
            get
            {
                if (string.IsNullOrEmpty(XmlMinProgramVersion))
                    return null;

                return new Version(XmlMinProgramVersion);
            }
            set
            {
                if (value == null)
                    XmlMinProgramVersion = string.Empty;
                else
                    XmlMinProgramVersion = value.ToString();
            }
        }

        private string _moduleShortName;
        [XmlAttribute]
        public string ShortName
        {
            get
            {
                return !string.IsNullOrEmpty(_moduleShortName) ? _moduleShortName.ToLower() : _moduleShortName;
            }
            set
            {
                _moduleShortName = value;
            }
        }

        [XmlAttribute("Name")]
        public string DisplayName { get; set; }

        [XmlAttribute]
        public string Locale { get; set; }

        [XmlAttribute]
        public string Description { get; set; }

        [XmlElement]
        public BibleTranslationDifferences BibleTranslationDifferences { get; set; }

        [XmlElement]
        public BibleStructureInfo BibleStructure { get; set; }

        private int _maxBookNameLength;
        [XmlIgnore]
        public int MaxBookNameLength
        {
            get 
            {
                if (_maxBookNameLength == 0)
                    _maxBookNameLength = this.BibleStructure.BibleBooks.Max(b => b.Abbreviations.Max(ab => ab.Value.Length));

                return _maxBookNameLength;
            }
        }

        public ModuleInfo()
        {
            this.BibleTranslationDifferences = new BibleTranslationDifferences();
        }
       

        /// <summary>
        /// возвращает книгу Библии с учётом всех сокращений 
        /// </summary>
        /// <param name="s">Строка, которая предположительно представляет собой название книги. Ни одного лишнего сивола не должно быть.</param>
        /// <param name="endsWithDot">Методу передаётся уже стримленная строка. Потому отдельно передаётся: заканчивалось ли название книги на точку. Если имя книги было полное (а не сокращённое) и оно окончивалось на точку, то не считаем это верной записью.</param>
        /// <returns></returns>
        public Abbreviation GetBibleBook(string s, bool endsWithDot)
        {
            if (s.Length == 0)               
                return null;            

            s = s.ToLowerInvariant();

            var result = GetBibleBookByExactMatch(s, endsWithDot);
            if (result == null && s.Length > 0
                && (char.IsDigit(s[0]) || s[0] == 'i' || s.Contains(". ")))  // может быть "I Cor 4:6", "Иис. Нав 1:1"                
            {
                s = s.Replace(" ", string.Empty).Replace(" ", string.Empty); // чтоб находил "1 John", когда в списке сокращений только "1John"
                result = GetBibleBookByExactMatch(s, endsWithDot);
            }

            return result;
        }

        private Abbreviation GetBibleBookByExactMatch(string s, bool endsWithDot)
        {   
            Abbreviation abbreviation = null;

            if (BibleStructure.AllAbbreviations.ContainsKey(s))
            {
                abbreviation = BibleStructure.AllAbbreviations[s];
                if (endsWithDot && abbreviation.IsFullBookName)
                    abbreviation = null;
            }

            return abbreviation;            
        }               
    }    

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
        [XmlIgnore]
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
            var result = new Dictionary<string, Abbreviation>();

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

    [Serializable]
    public class BibleBookInfo
    {
        private static readonly object _locker = new object();

        [XmlAttribute]
        public int Index { get; set; }

        [XmlAttribute]
        public string Name { get; set; }

        [XmlAttribute]
        public string ShortName { get; set; }        

        [XmlAttribute]
        [DefaultValue("")]
        public string ChapterPageNameTemplate { get; set; }

        [XmlElement(typeof(Abbreviation), ElementName = "Abbreviation")]
        public List<Abbreviation> Abbreviations { get; set; }

        private string _friendlyShortName;
        public string FriendlyShortName
        {
            get
            {
                if (_friendlyShortName == null)
                {
                    _friendlyShortName = ShortName;

                    if (string.IsNullOrEmpty(_friendlyShortName))
                    {
                        _friendlyShortName = Name;
                        if (_friendlyShortName.Contains(' '))
                        {
                            var parts = _friendlyShortName.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length == 2)
                            {
                                _friendlyShortName = parts[1];

                                if (char.IsDigit(parts[0][0]))
                                    _friendlyShortName = parts[0][0] + _friendlyShortName;
                            }
                        }
                    }

                    _friendlyShortName = StringUtils.MakeFirstLetterUpper(_friendlyShortName);
                }

                return _friendlyShortName;
            }
        }

        private Dictionary<string, Abbreviation> _allAbbreviations;
        [XmlIgnore]
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

            Abbreviations.ForEach(abbr =>
            {
                abbr.Value = abbr.Value.ToLowerInvariant();     // вдруг где-то в модуле случайно указали с большой буквы            
                abbr.BibleBook = this;
            });  

            foreach (var abbr in Abbreviations)
            {
                if (!result.ContainsKey(abbr.Value))
                    result.Add(abbr.Value, abbr);
            }

            var nameLower = Name.ToLowerInvariant();
            if (!result.ContainsKey(nameLower))
                result.Add(nameLower, new Abbreviation(nameLower) { IsFullBookName = true, BibleBook = this });

            return result;
        }
    }

    [Serializable]
    public class Abbreviation
    {
        [XmlAttribute]
        [DefaultValue(false)]
        public bool IsFullBookName { get; set; }

        [XmlText]
        public string Value { get; set; }

        [XmlAttribute]
        [DefaultValue("")]
        public string ModuleName { get; set; }

        [XmlIgnore]
        public BibleBookInfo BibleBook { get; set; }

        public Abbreviation()
        {
        }

        public Abbreviation(string value)
        {
            this.Value = value;
        }

        public static implicit operator Abbreviation(string value)
        {
            return new Abbreviation(value);
        }
    }   

    [Serializable]
    public class BibleTranslationDifferences
    {
        /// <summary>
        /// Первые буквы алфавита для разбиения стихов на части
        /// </summary>
        [XmlAttribute]
        public string PartVersesAlphabet { get; set; }

        [XmlElement(typeof(BibleBookDifferences), ElementName = "BookDifferences")]
        public List<BibleBookDifferences> BookDifferences { get; set; }

        public BibleTranslationDifferences()
        {
            this.BookDifferences = new List<BibleBookDifferences>();
        }
    }

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

    [Serializable]
    public class BibleBookDifference
    {
        /// <summary>
        /// Выравнивание стихов, если, например, на два стиха приходится один параллельный
        /// </summary>
        public enum CorrespondenceVerseType
        {
            All = 0,
            First = 1,
            Last = 2
        }

        [XmlAttribute]
        public string BaseVerses { get; set; }

        [XmlAttribute]
        public string ParallelVerses { get; set; }

        [XmlAttribute]
        [DefaultValue(false)]
        public bool SkipCheck { get; set; }

        [XmlAttribute]
        [DefaultValue(false)]
        public bool EmptyVerse { get; set; }

        /// <summary>
        /// Выравнивание стихов - при несоответствии, 
        /// </summary>
        [XmlAttribute]
        [DefaultValue((int)CorrespondenceVerseType.All)]
        public CorrespondenceVerseType CorrespondenceType { get; set; }

        /// <summary>
        /// Количество стихов, соответствующих версии KJV. По умолчанию - все стихи соответствуют KJV (если CorrespondenceType = All), либо только один стих (в обратном случае)
        /// </summary>
        [XmlAttribute]
        public string ValueVersesCount { get; set; }

        public BibleBookDifference()
        {
        }       
    }   
}
