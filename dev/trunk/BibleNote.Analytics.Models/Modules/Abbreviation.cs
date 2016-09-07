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
}
