using System;
using System.ComponentModel;
using System.Linq;
using System.Xml.Serialization;
using Newtonsoft.Json;

namespace BibleNote.Services.ModulesManager.Scheme.Module
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

        [XmlIgnore, JsonIgnore]
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

        [XmlIgnore, JsonIgnore]
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
        [XmlIgnore, JsonIgnore]
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
        /// Возвращает книгу Библии с учётом всех сокращений 
        /// </summary>
        /// <param name="s">Строка, которая предположительно представляет собой название книги. Ни одного лишнего сивола не должно быть.</param>
        /// <param name="endsWithDot">Методу передаётся уже стримленная строка. Потому отдельно передаётся: заканчивалось ли название книги на точку. Если имя книги было полное (а не сокращённое) и оно окончивалось на точку, то не считаем это верной записью.</param>
        /// <returns></returns>
        public Abbreviation GetBibleBook(string s, bool endsWithDot)
        {
            if (s.Length == 0)               
                return null;            

            var result = GetBibleBookByExactMatch(s, endsWithDot);
            if (result == null && s.Length > 0
                && (char.IsDigit(s[0]) || char.ToLowerInvariant(s[0]) == 'i' || s.Contains(". ")))  // может быть "I Cor 4:6", "Иис. Нав 1:1"                
            {
                s = s.Replace(" ", string.Empty).Replace(" ", string.Empty); // чтоб находил "1 John", когда в списке сокращений только "1John"
                result = GetBibleBookByExactMatch(s, endsWithDot);
            }

            return result;
        }

        private Abbreviation GetBibleBookByExactMatch(string s, bool endsWithDot)
        {
            if (BibleStructure.AllAbbreviations.TryGetValue(s, out Abbreviation abbreviation))
            {
                if (endsWithDot && abbreviation.IsFullBookName)
                    abbreviation = null;
            }

            return abbreviation;            
        }               
    }    
}
