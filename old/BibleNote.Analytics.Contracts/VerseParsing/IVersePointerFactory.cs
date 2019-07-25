using BibleNote.Analytics.Models.Verse;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing
{
    public interface IVersePointerFactory
    {
        VersePointer CreateVersePointer(string text);        
    }
}
