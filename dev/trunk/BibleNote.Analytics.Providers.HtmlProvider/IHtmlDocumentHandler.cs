﻿using BibleNote.Analytics.Contracts.Providers;
using HtmlAgilityPack;
using System;

namespace BibleNote.Analytics.Providers.Html
{
    public interface IHtmlDocumentHandler : IDocumentHandler
    {
        HtmlDocument HtmlDocument { get; }
    }
}