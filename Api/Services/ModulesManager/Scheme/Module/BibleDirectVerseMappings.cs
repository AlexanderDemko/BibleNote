using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Xml.Serialization;

namespace BibleNote.Services.ModulesManager.Scheme.Module
{
    /// <summary>
    /// Explicit verse relations to one named reference module. Unlike the legacy formula list,
    /// this representation is lossless for reviewed many-to-one and one-to-many mappings.
    /// VerseIdRegistry names the neutral identity space; ReferenceModule supplies only its
    /// coordinate numbering. Coordinates not present in the list retain the normal identity fallback.
    /// </summary>
    [Serializable]
    public class BibleDirectVerseMappings
    {
        [XmlAttribute]
        public string ReferenceModule { get; set; }

        [XmlAttribute]
        [DefaultValue(1)]
        public int SchemaVersion { get; set; } = 1;

        [XmlAttribute]
        public string VerseIdRegistry { get; set; }

        /// <summary>
        /// Compatibility metadata for direct maps created before neutral VerseId registries.
        /// New modules use VerseIdRegistry.
        /// </summary>
        [XmlAttribute]
        public string CanonicalSystem { get; set; }

        [XmlElement(typeof(BibleDirectBookMappings), ElementName = "BookMappings")]
        public List<BibleDirectBookMappings> Books { get; set; } = new List<BibleDirectBookMappings>();
    }

    [Serializable]
    public class BibleDirectBookMappings
    {
        [XmlAttribute]
        public int BookIndex { get; set; }

        [XmlElement(typeof(BibleDirectVerseMapping), ElementName = "Mapping")]
        public List<BibleDirectVerseMapping> Mappings { get; set; } = new List<BibleDirectVerseMapping>();
    }

    [Serializable]
    public class BibleDirectVerseMapping
    {
        [XmlAttribute]
        public int ReferenceChapter { get; set; }

        [XmlAttribute]
        public int ReferenceVerse { get; set; }

        [XmlAttribute]
        public int ModuleChapter { get; set; }

        [XmlAttribute]
        public int ModuleVerse { get; set; }

        [XmlAttribute]
        [DefaultValue(false)]
        public bool ReferenceIsEmpty { get; set; }

        [XmlAttribute]
        [DefaultValue(false)]
        public bool ModuleIsEmpty { get; set; }
    }
}
