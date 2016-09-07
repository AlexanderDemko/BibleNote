using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Verse
{
    public class VersesListInfo<T> where T : SimpleVersePointer
    {
        public List<T> Verses { get; internal set; }
        public List<T> NotFoundVerses { get; internal set; }
        public int VersesCount { get; set; }

        public VersesListInfo()
        {
            Verses = new List<T>();
            NotFoundVerses = new List<T>();
        }

        public void Clear()
        {
            Verses = new List<T>();
            VersesCount = 0;
            // Сохраняем имеющиеся ненайденные стихи
        }
    }
}
