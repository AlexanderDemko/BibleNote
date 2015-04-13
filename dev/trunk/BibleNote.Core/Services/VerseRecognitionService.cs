using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using BibleNote.Core.Services.System;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        private IVersePointerFactory _verseParserService;
        public VerseRecognitionService()
        {
            _verseParserService = DIContainer.Resolve<IVersePointerFactory>();
        }

        public VerseEntryInfo TryGetVerse(string text, int index)
        {
            throw new NotImplementedException();
        }
    }
}
