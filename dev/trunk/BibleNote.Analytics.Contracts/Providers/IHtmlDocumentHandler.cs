using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;
using System;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}