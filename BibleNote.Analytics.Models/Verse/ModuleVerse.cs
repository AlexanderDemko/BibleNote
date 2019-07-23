using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Verse
{
    public class ModuleVerse : ModuleVersePointer
    {
        /// <summary>
        /// Строка, соответствующая номерам/номеру стиха. Может быть: "5", "5-6", "6:5-6"
        /// </summary>
        public string VerseNumberString { get; set; }

        /// <summary>
        /// Текст стиха без номера
        /// </summary>
        public string VerseContent { get; set; }

        public ModuleVerse()
        {
            throw new NotImplementedException();
        }
    }
}
