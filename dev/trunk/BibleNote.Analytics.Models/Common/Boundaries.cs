using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public struct Boundaries
    {
        public int StartIndex { get; set; }

        public int EndIndex { get; set; }

        public Boundaries(int startIndex, int endIndex)
        {
            StartIndex = startIndex;
            EndIndex = endIndex;
        }
    }
}
