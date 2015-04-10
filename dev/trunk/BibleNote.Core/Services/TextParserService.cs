using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class TextParserService : ITextParserService
    {
        public ParagraphParseResult ParseParagraph(string text, DocumentParseContext docParseResult)
        {
            var result = new ParagraphParseResult();


            return result;
        }
    }
}
