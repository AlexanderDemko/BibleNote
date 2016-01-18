using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        public Models.Common.VersePointer TryRecognizeVerse(Models.Common.VerseEntryInfo verseEntry, Models.Common.DocumentParseContext docParseContext)
        {
            throw new NotImplementedException();
        }
    }
}
