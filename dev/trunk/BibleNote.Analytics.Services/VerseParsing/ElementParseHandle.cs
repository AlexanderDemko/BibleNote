using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class ElementParseHandle : IElementParseHandle
    {
        private readonly IDocumentParseContext _documentParseContext;

        public ElementParseHandle(IDocumentParseContext documentParseContext)
        {
            _documentParseContext = documentParseContext;
        }

        public void Dispose()
        {
            _documentParseContext.ExitElement();
        }
    }
}
