using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using System.IO;
using BibleNote.Analytics.Providers.OneNote.Contracts;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        public IOneNoteDocumentHandler Connect(IDocumentId documentId)
        {
            return new OneNoteDocumentHandler(documentId);
        }
    }
}
