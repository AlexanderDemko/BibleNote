using System;
using System.ComponentModel;
using System.Xml.Serialization;

namespace BibleNote.Services.ModulesManager.Scheme.Module
{
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
