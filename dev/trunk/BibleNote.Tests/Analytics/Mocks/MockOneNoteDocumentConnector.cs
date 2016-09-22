using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using System.IO;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Providers.Html;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockOneNoteDocumentConnector : IOneNoteDocumentConnector
    {
        public IHtmlDocumentHandler Connect(IDocumentId documentId)
        {
            return new HtmlDocumentHandler(documentId);
        }
    }
}
