using Newtonsoft.Json;
using System;
using System.ComponentModel;
using System.Xml.Serialization;

namespace BibleNote.Analytics.Services.ModulesManager.Scheme.Module
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

        [XmlIgnore, JsonIgnore]
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
