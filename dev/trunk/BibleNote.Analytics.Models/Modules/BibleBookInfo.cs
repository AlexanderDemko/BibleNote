using BibleNote.Analytics.Core.Helpers;
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
                abbr.Value = abbr.Value;
                abbr.BibleBook = this;
            });

            foreach (var abbr in Abbreviations)
            {
                if (!result.ContainsKey(abbr.Value))
                    result.Add(abbr.Value, abbr);
            }

            if (!result.ContainsKey(Name))
                result.Add(Name, new Abbreviation(Name) { IsFullBookName = true, BibleBook = this });

            return result;
        }
    }
}
