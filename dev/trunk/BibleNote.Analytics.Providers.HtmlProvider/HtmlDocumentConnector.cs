using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using HtmlAgilityPack;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using System.IO;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class HtmlDocumentConnector : IHtmlDocumentConnector
    {
        public IHtmlDocumentHandler Connect(IDocumentId documentId)
        {
            return new HtmlDocumentHandler(documentId);
        }
    }
}
