using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.HtmlProvider;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public interface IHtmlDocumentConnector : IDocumentConnector<IHtmlDocumentHandler>
    {        
    }
}
