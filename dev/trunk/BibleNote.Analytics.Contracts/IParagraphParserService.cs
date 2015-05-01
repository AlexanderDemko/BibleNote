using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts
{
    public interface IParagraphParserService
    {
        ParagraphParseResult ParseParagraph(string text, DocumentParseContext docParseContext);
    }
}
