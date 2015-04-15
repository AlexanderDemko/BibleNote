using System;

namespace BibleNote.Analytics.Contracts
{
    public interface IConfigurationManager
    {
        string DBContentPath { get; set; }
        string DBIndexPath { get; set; }
        string ModuleShortName { get; set; }

        bool UseCommaDelimiter { get; set; }
    }
}
