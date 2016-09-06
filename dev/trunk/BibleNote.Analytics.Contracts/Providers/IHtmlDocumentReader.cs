using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IHtmlDocumentReader
    {
        HtmlDocument Read(IDocumentId documentId);
    }
}
