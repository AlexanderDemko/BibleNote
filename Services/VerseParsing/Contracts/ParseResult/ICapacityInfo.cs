namespace BibleNote.Services.VerseParsing.Contracts.ParseResult
{
    public interface ICapacityInfo
    {
        int TextLength { get; }

        /// <summary>
        /// Include subverses
        /// </summary>
        int VersesCount { get; }
    }
}
