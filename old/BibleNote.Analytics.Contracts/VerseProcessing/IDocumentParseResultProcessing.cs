using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseProcessing
{
    public interface IDocumentParseResultProcessing
    {
        void Process(int documentId, DocumentParseResult documentResult);
    }
}
