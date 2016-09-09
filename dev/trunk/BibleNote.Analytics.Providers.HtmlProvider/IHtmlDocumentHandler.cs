using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;
using System;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}